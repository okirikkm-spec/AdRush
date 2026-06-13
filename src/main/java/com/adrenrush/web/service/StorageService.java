package com.adrenrush.web.service;

import io.minio.*;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

/**
 * Единая точка хранения медиа (аватарки, пользовательские фото).
 * Если MinIO включён — кладём объекты в bucket и отдаём через /media/**.
 * Иначе — сохраняем в локальную папку uploads/ и отдаём через /uploads/**.
 */
@Service
public class StorageService {

    private static final Logger log = LoggerFactory.getLogger(StorageService.class);

    private final MinioClient minioClient; // null, если MinIO выключен

    @Value("${minio.bucket}")
    private String bucket;

    @Value("${minio.enabled:true}")
    private boolean minioEnabled;

    public StorageService(ObjectProvider<MinioClient> minioClientProvider) {
        this.minioClient = minioClientProvider.getIfAvailable();
    }

    @PostConstruct
    public void init() {
        if (!minioEnabled || minioClient == null) {
            log.info("Хранилище: локальная папка uploads/ (MinIO выключен)");
            return;
        }
        try {
            boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
            if (!exists) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                log.info("MinIO bucket '{}' создан", bucket);
            }
        } catch (Exception e) {
            log.warn("Не удалось инициализировать MinIO bucket '{}': {}", bucket, e.getMessage());
        }
    }

    public boolean isMinioActive() {
        return minioEnabled && minioClient != null;
    }

    /**
     * Сохраняет файл и возвращает публичный URL-путь для отдачи клиенту.
     *
     * @param key полный ключ объекта, например "photos/12/abc.jpg"
     */
    public String store(String key, InputStream data, String contentType) throws Exception {
        if (contentType == null) contentType = "application/octet-stream";

        if (isMinioActive()) {
            minioClient.putObject(
                PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .stream(data, -1, 10485760)
                    .contentType(contentType)
                    .build()
            );
            return "/media/" + key;
        }

        Path target = Paths.get("uploads").resolve(key);
        Files.createDirectories(target.getParent());
        Files.copy(data, target, StandardCopyOption.REPLACE_EXISTING);
        return "/uploads/" + key;
    }

    /** Поток объекта из MinIO (для MediaController). */
    public InputStream getObject(String key) throws Exception {
        return minioClient.getObject(
            GetObjectArgs.builder().bucket(bucket).object(key).build()
        );
    }

    /** Удаляет файл по его публичному пути (/media/... или /uploads/...). Внешние ссылки игнорирует. */
    public void delete(String urlPath) {
        if (urlPath == null || urlPath.isBlank()) return;
        try {
            if (urlPath.startsWith("/media/")) {
                if (isMinioActive()) {
                    String key = urlPath.substring("/media/".length());
                    minioClient.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
                }
            } else if (urlPath.startsWith("/uploads/")) {
                String rel = urlPath.substring("/uploads/".length());
                Files.deleteIfExists(Paths.get("uploads").resolve(rel));
            }
            // внешние http(s)-ссылки удалять нечего
        } catch (Exception e) {
            log.warn("Не удалось удалить файл {}: {}", urlPath, e.getMessage());
        }
    }
}
