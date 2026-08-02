package com.adrenrush.web.service;

import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Optional;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Превью для типичного пэкшота каталога. Проверка неочевидная, но нужная: предел
 * {@link ImageService#THUMB_MAX_DIM} однажды оказался больше самих картинок магазинов
 * (~150×370), уменьшать было нечего, «превью» получалось не легче оригинала и отбрасывалось —
 * две трети списка молча грузили полноразмерные PNG.
 */
class ImageServiceThumbnailTest {

    private final ImageService imageService = new ImageService();

    @Test
    void makesLighterThumbnailForCatalogPackshot() throws Exception {
        byte[] packshot = packshotPng(148, 370);

        Optional<byte[]> thumb = imageService.makeThumbnail(packshot, "png");

        assertTrue(thumb.isPresent(), "для пэкшота каталога превью должно создаваться");
        assertTrue(thumb.get().length < packshot.length,
            "превью должно быть легче оригинала: " + thumb.get().length + " ≥ " + packshot.length);

        BufferedImage img = ImageIO.read(new ByteArrayInputStream(thumb.get()));
        assertTrue(Math.max(img.getWidth(), img.getHeight()) <= ImageService.THUMB_MAX_DIM,
            "длинная сторона превью не должна превышать " + ImageService.THUMB_MAX_DIM);
        assertTrue(imageService.hasTransparentPixels(thumb.get()),
            "прозрачность вырезанного фона должна пережить уменьшение");
    }

    /**
     * Похожая на настоящий пэкшот картинка: прозрачные поля по краям и «банка» из шумного
     * градиента в середине. Шум здесь принципиален — именно он делает прозрачный PNG тяжёлым,
     * и без него проверка «легче оригинала» ничего не значила бы.
     */
    private byte[] packshotPng(int width, int height) throws Exception {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Random random = new Random(42);
        int marginX = width / 5;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                if (x < marginX || x > width - marginX || y < 20 || y > height - 20) {
                    img.setRGB(x, y, 0);
                    continue;
                }
                int base = 60 + (y * 150) / height;
                int r = clamp(base + random.nextInt(40));
                int g = clamp(base / 2 + random.nextInt(40));
                int b = clamp(200 - base + random.nextInt(40));
                img.setRGB(x, y, 0xFF000000 | (r << 16) | (g << 8) | b);
            }
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private int clamp(int v) {
        return Math.max(0, Math.min(255, v));
    }
}
