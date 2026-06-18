package com.adrenrush.web.service;

import net.coobird.thumbnailator.Thumbnails;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Optional;

/** Генерация уменьшенных превью изображений (для карточек на главной и миниатюр галереи). */
@Service
public class ImageService {

    private static final Logger log = LoggerFactory.getLogger(ImageService.class);

    /** Максимальная сторона превью в пикселях — с запасом под сетку карточек/ретину. */
    public static final int THUMB_MAX_DIM = 600;

    /**
     * Делает превью из байтов изображения. Возвращает пусто, если формат не поддержан
     * (webp/svg/повреждённое) или превью не даёт выигрыша — тогда вызывающий откатывается на оригинал.
     *
     * @param outputFormat "png" — сохранить прозрачность; иначе "jpg"
     */
    public Optional<byte[]> makeThumbnail(byte[] source, String outputFormat) {
        if (source == null || source.length == 0) return Optional.empty();
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            Thumbnails.of(new ByteArrayInputStream(source))
                .size(THUMB_MAX_DIM, THUMB_MAX_DIM)
                .keepAspectRatio(true)
                .outputQuality(0.82)
                .outputFormat(outputFormat)
                .toOutputStream(out);
            byte[] thumb = out.toByteArray();
            // если превью не легче оригинала (мелкая картинка и т.п.) — смысла в нём нет
            if (thumb.length == 0 || thumb.length >= source.length) return Optional.empty();
            return Optional.of(thumb);
        } catch (Exception e) {
            log.debug("Превью не сгенерировано (формат {}): {}", outputFormat, e.getMessage());
            return Optional.empty();
        }
    }
}
