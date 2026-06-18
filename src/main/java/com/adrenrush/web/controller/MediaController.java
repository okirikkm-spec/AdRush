package com.adrenrush.web.controller;

import com.adrenrush.web.service.StorageService;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.HandlerMapping;
import jakarta.servlet.http.HttpServletRequest;

import java.io.InputStream;
import java.util.concurrent.TimeUnit;

/** Отдаёт пользовательские медиа из MinIO (когда хранилище в режиме MinIO). */
@RestController
@RequestMapping("/media")
public class MediaController {

    private final StorageService storageService;

    public MediaController(StorageService storageService) {
        this.storageService = storageService;
    }

    @GetMapping("/**")
    public ResponseEntity<InputStreamResource> get(HttpServletRequest request) {
        String path = (String) request.getAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE);
        String key = path.startsWith("/media/") ? path.substring("/media/".length()) : path;

        if (!storageService.isMinioActive()) {
            return ResponseEntity.notFound().build();
        }
        try {
            InputStream stream = storageService.getObject(key);
            MediaType contentType = MediaTypeFactory.getMediaType(key)
                .orElse(MediaType.APPLICATION_OCTET_STREAM);
            // Ключи объектов уникальны (timestamp+hash), поэтому кэшируем надолго.
            return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(30, TimeUnit.DAYS).cachePublic())
                .contentType(contentType)
                .body(new InputStreamResource(stream));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }
}
