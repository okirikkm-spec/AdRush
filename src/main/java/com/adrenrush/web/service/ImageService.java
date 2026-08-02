package com.adrenrush.web.service;

import net.coobird.thumbnailator.Thumbnails;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Optional;

/** Обработка изображений каталога: превью для карточек и вырезание белого фона у пэкшотов. */
@Service
public class ImageService {

    private static final Logger log = LoggerFactory.getLogger(ImageService.class);

    /**
     * Максимальная сторона превью в пикселях. В карточке обложка занимает 92 px, так что 256
     * покрывает даже трёхкратную плотность экрана. Раньше стояло 600 — больше, чем сами пэкшоты
     * магазинов (обычно ~150×370), поэтому «превью» получалось в натуральную величину, не проходило
     * проверку «легче оригинала» и не сохранялось вовсе: две трети списка грузили полноразмерные PNG.
     */
    public static final int THUMB_MAX_DIM = 256;

    /**
     * Округление каналов у превью — до 5 бит против 6 у полноразмерной картинки. На 92 px разницу
     * не видно, а вес прозрачного PNG падает примерно вдвое: одинаковых соседних пикселей больше,
     * и zlib сжимает их лучше.
     */
    private static final int THUMB_COLOR_MASK = 0x00F8F8F8;
    private static final int FULL_COLOR_MASK = 0x00FCFCFC;

    /**
     * Фоном считаем пиксель не темнее этого по каждому каналу. 232, а не 255: у JPEG студийный
     * белый «плавает» из-за компрессии, а у пэкшотов бывает лёгкий градиент подложки.
     */
    private static final int BG_MIN_CHANNEL = 232;
    /** …и при этом почти серый: большой разброс каналов означает цветной фон, а не белый. */
    private static final int BG_MAX_SPREAD = 18;
    /** Кайма: соседний с фоном пиксель светлее этого гасим частично — иначе край банки «рваный». */
    private static final int EDGE_MIN_CHANNEL = 200;
    /** Сколько граничных пикселей должно быть белыми, чтобы вообще браться за картинку. */
    private static final double MIN_BORDER_WHITE_RATIO = 0.7;
    /** Меньше этой доли фона — вырезать нечего; больше — картинка почти пустая, это не пэкшот. */
    private static final double MIN_BACKGROUND_RATIO = 0.02;
    private static final double MAX_BACKGROUND_RATIO = 0.97;
    /** Дальше этого размера не идём: заливка держит в памяти маску на каждый пиксель. */
    private static final int MAX_PIXELS = 40_000_000;

    /**
     * Делает превью из байтов изображения. Возвращает пусто, если формат не поддержан
     * (webp/svg/повреждённое) или превью не даёт выигрыша — тогда вызывающий откатывается на оригинал.
     *
     * @param outputFormat "png" — сохранить прозрачность; иначе "jpg"
     */
    public Optional<byte[]> makeThumbnail(byte[] source, String outputFormat) {
        if (source == null || source.length == 0) return Optional.empty();
        try {
            byte[] thumb = "png".equalsIgnoreCase(outputFormat) ? pngThumbnail(source) : jpgThumbnail(source);
            // если превью не легче оригинала (мелкая картинка и т.п.) — смысла в нём нет
            if (thumb == null || thumb.length == 0 || thumb.length >= source.length) return Optional.empty();
            return Optional.of(thumb);
        } catch (Exception e) {
            log.debug("Превью не сгенерировано (формат {}): {}", outputFormat, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Превью для PNG. Масштабируем в ARGB явно: иначе у палитровых PNG (альфа живёт в чанке tRNS)
     * прозрачность теряется и фон становится чёрным. Цвета округляем до 6 бит — прозрачный PNG
     * заметно тяжелее палитрового оригинала, и без этого превью не проходило бы проверку «легче
     * оригинала» и не создавалось вовсе.
     */
    private byte[] pngThumbnail(byte[] source) throws IOException {
        BufferedImage scaled = Thumbnails.of(new ByteArrayInputStream(source))
            .size(THUMB_MAX_DIM, THUMB_MAX_DIM)
            .keepAspectRatio(true)
            .imageType(BufferedImage.TYPE_INT_ARGB)
            .asBufferedImage();

        int w = scaled.getWidth();
        int h = scaled.getHeight();
        int[] px = scaled.getRGB(0, 0, w, h, null, 0, w);
        clearInvisibleColors(px);
        posterize(px, THUMB_COLOR_MASK);
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        out.setRGB(0, 0, w, h, px, 0, w);

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        return ImageIO.write(out, "png", bytes) ? bytes.toByteArray() : null;
    }

    private byte[] jpgThumbnail(byte[] source) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Thumbnails.of(new ByteArrayInputStream(source))
            .size(THUMB_MAX_DIM, THUMB_MAX_DIM)
            .keepAspectRatio(true)
            .outputQuality(0.82)
            .outputFormat("jpg")
            .toOutputStream(out);
        return out.toByteArray();
    }

    /**
     * Длинная сторона картинки больше нынешнего предела для превью. По этому признаку находятся
     * превью, собранные при прежнем (втрое большем) значении {@link #THUMB_MAX_DIM}, — их стоит
     * пересобрать.
     */
    public boolean exceedsThumbSize(byte[] data) {
        if (data == null || data.length == 0) return false;
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(data));
            return img != null && Math.max(img.getWidth(), img.getHeight()) > THUMB_MAX_DIM;
        } catch (Exception e) {
            log.debug("Размеры превью не прочитаны: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Делает белый фон пэкшота прозрачным и возвращает PNG.
     *
     * Убирается именно ФОН, а не белый цвет: заливка идёт от краёв изображения внутрь и
     * останавливается на первом небелом пикселе, поэтому белая крышка, надписи и блики на самой
     * банке остаются на месте — до них заливка не доходит, они окружены цветом. Пиксели на стыке
     * гасятся частично (по «белизне»), иначе контур получается ступенчатым.
     *
     * Возвращает пусто, когда трогать картинку не нужно или опасно: формат не читается, фон уже
     * прозрачный, рамка не белая (фото на цветном фоне), удалять почти нечего либо, наоборот,
     * «фоном» оказалась почти вся картинка.
     */
    public Optional<byte[]> removeWhiteBackground(byte[] source) {
        if (source == null || source.length == 0) return Optional.empty();
        try {
            BufferedImage src = ImageIO.read(new ByteArrayInputStream(source));
            if (src == null) return Optional.empty();

            int w = src.getWidth();
            int h = src.getHeight();
            if (w < 8 || h < 8 || (long) w * h > MAX_PIXELS) return Optional.empty();

            int[] px = src.getRGB(0, 0, w, h, null, 0, w);
            if (hasTransparentPixels(src, px)) return Optional.empty();
            if (borderWhiteRatio(px, w, h) < MIN_BORDER_WHITE_RATIO) return Optional.empty();

            boolean[] background = floodFillFromBorder(px, w, h);
            int cut = 0;
            for (boolean b : background) if (b) cut++;

            double ratio = (double) cut / px.length;
            if (ratio < MIN_BACKGROUND_RATIO || ratio > MAX_BACKGROUND_RATIO) return Optional.empty();

            applyTransparency(px, smoothAlpha(buildAlpha(px, background, w, h), w, h), w, h);
            clearInvisibleColors(px);
            posterize(px, FULL_COLOR_MASK);

            BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
            out.setRGB(0, 0, w, h, px, 0, w);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            if (!ImageIO.write(out, "png", bytes)) return Optional.empty();
            return Optional.of(bytes.toByteArray());
        } catch (Exception e) {
            log.debug("Фон не вырезан: {}", e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Есть ли в изображении полностью прозрачные пиксели. Нужно, чтобы находить превью, у которых
     * прозрачность потерялась при уменьшении (в карточке такая картинка выглядит как банка на
     * чёрном прямоугольнике, хотя оригинал прозрачный).
     */
    public boolean hasTransparentPixels(byte[] source) {
        if (source == null || source.length == 0) return false;
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(source));
            if (img == null || !img.getColorModel().hasAlpha()) return false;
            int w = img.getWidth();
            int h = img.getHeight();
            int[] px = img.getRGB(0, 0, w, h, null, 0, w);
            for (int p : px) {
                if ((p >>> 24) == 0) return true;
            }
            return false;
        } catch (Exception e) {
            log.debug("Не удалось проверить прозрачность: {}", e.getMessage());
            return false;
        }
    }

    /** Картинка уже с прозрачностью — значит фон убирали раньше, второй раз не трогаем. */
    private boolean hasTransparentPixels(BufferedImage src, int[] px) {
        if (!src.getColorModel().hasAlpha()) return false;
        for (int p : px) {
            if ((p >>> 24) < 250) return true;
        }
        return false;
    }

    /** Доля белых пикселей по рамке изображения: у пэкшота на белом она близка к единице. */
    private double borderWhiteRatio(int[] px, int w, int h) {
        int white = 0;
        int total = 0;
        for (int x = 0; x < w; x++) {
            if (isBackgroundWhite(px[x])) white++;
            if (isBackgroundWhite(px[(h - 1) * w + x])) white++;
            total += 2;
        }
        for (int y = 1; y < h - 1; y++) {
            if (isBackgroundWhite(px[y * w])) white++;
            if (isBackgroundWhite(px[y * w + w - 1])) white++;
            total += 2;
        }
        return total == 0 ? 0 : (double) white / total;
    }

    /**
     * Заливка белого от краёв внутрь (обход в ширину по 4 соседям). Именно она отличает фон от
     * белого на самом напитке: до внутренних белых областей волна не доходит, её останавливает
     * цветной контур банки.
     */
    private boolean[] floodFillFromBorder(int[] px, int w, int h) {
        boolean[] background = new boolean[px.length];
        Deque<Integer> queue = new ArrayDeque<>();

        for (int x = 0; x < w; x++) {
            enqueueIfWhite(px, background, queue, x);
            enqueueIfWhite(px, background, queue, (h - 1) * w + x);
        }
        for (int y = 0; y < h; y++) {
            enqueueIfWhite(px, background, queue, y * w);
            enqueueIfWhite(px, background, queue, y * w + w - 1);
        }

        while (!queue.isEmpty()) {
            int idx = queue.poll();
            int x = idx % w;
            int y = idx / w;
            if (x > 0) enqueueIfWhite(px, background, queue, idx - 1);
            if (x < w - 1) enqueueIfWhite(px, background, queue, idx + 1);
            if (y > 0) enqueueIfWhite(px, background, queue, idx - w);
            if (y < h - 1) enqueueIfWhite(px, background, queue, idx + w);
        }
        return background;
    }

    private void enqueueIfWhite(int[] px, boolean[] background, Deque<Integer> queue, int idx) {
        if (background[idx] || !isBackgroundWhite(px[idx])) return;
        background[idx] = true;
        queue.add(idx);
    }

    /**
     * Считает альфу каждого пикселя: фон — 0, объект — 255, а светлый ореол вдоль контура (след
     * белой подложки, размазанный компрессией) — промежуточные значения, тем меньше, чем пиксель
     * белее. Без этого шага вокруг банки остаётся светлая обводка.
     */
    private int[] buildAlpha(int[] px, boolean[] background, int w, int h) {
        int[] alpha = new int[px.length];
        for (int idx = 0; idx < px.length; idx++) {
            if (background[idx]) continue;
            int min = minChannel(px[idx]);
            if (min >= EDGE_MIN_CHANNEL && touchesBackground(background, idx, w, h)) {
                alpha[idx] = Math.round(255f * (255 - min) / (255f - EDGE_MIN_CHANNEL));
            } else {
                alpha[idx] = 255;
            }
        }
        return alpha;
    }

    /**
     * Сглаживает край: заливка даёт жёсткую маску «фон/не фон», из-за чего наклонные бока банки
     * идут заметной лесенкой. Свёртка 3×3 (гауссовы веса 1-2-1) размывает ТОЛЬКО приграничную
     * полосу — внутри объекта и в глубине фона все соседи одинаковы, и значение не меняется.
     */
    private int[] smoothAlpha(int[] alpha, int w, int h) {
        int[] out = alpha.clone();
        for (int y = 1; y < h - 1; y++) {
            for (int x = 1; x < w - 1; x++) {
                int idx = y * w + x;
                if (!isNearEdge(alpha, idx, w)) continue;
                int sum = alpha[idx - w - 1] + 2 * alpha[idx - w] + alpha[idx - w + 1]
                    + 2 * alpha[idx - 1] + 4 * alpha[idx] + 2 * alpha[idx + 1]
                    + alpha[idx + w - 1] + 2 * alpha[idx + w] + alpha[idx + w + 1];
                out[idx] = sum / 16;
            }
        }
        return out;
    }

    /** Пиксель у границы — если среди 8 соседей есть и прозрачный, и непрозрачный. */
    private boolean isNearEdge(int[] alpha, int idx, int w) {
        int min = 255;
        int max = 0;
        for (int dy = -1; dy <= 1; dy++) {
            for (int dx = -1; dx <= 1; dx++) {
                int a = alpha[idx + dy * w + dx];
                if (a < min) min = a;
                if (a > max) max = a;
            }
        }
        return max - min > 8;
    }

    /**
     * Проставляет альфу и убирает из полупрозрачных пикселей примешанный белый. На контуре цвет —
     * это смесь банки и подложки ({@code c = a·объект + (1−a)·белый}), поэтому объект
     * восстанавливается обратной формулой. Иначе край выглядит выцветшим: чем прозрачнее пиксель,
     * тем сильнее он был бы разбавлен белым.
     */
    private void applyTransparency(int[] px, int[] alpha, int w, int h) {
        for (int idx = 0; idx < px.length; idx++) {
            int a = alpha[idx];
            if (a >= 255) continue;
            if (a <= 0) {
                px[idx] = px[idx] & 0x00FFFFFF;
                continue;
            }
            int r = unmixWhite((px[idx] >> 16) & 0xFF, a);
            int g = unmixWhite((px[idx] >> 8) & 0xFF, a);
            int b = unmixWhite(px[idx] & 0xFF, a);
            px[idx] = (a << 24) | (r << 16) | (g << 8) | b;
        }
    }

    /** Обратная формула смешивания с белым, с защитой от выхода за диапазон. */
    private int unmixWhite(int channel, int alpha) {
        int value = Math.round((channel - 255f * (255 - alpha) / 255f) * 255f / alpha);
        return Math.max(0, Math.min(255, value));
    }

    /**
     * Огрубляет цвета до заданной маски (6 бит на канал у полной картинки, 5 — у превью). PNG с
     * прозрачностью в разы тяжелее исходного JPEG, а больше всего весит шум компрессии: после
     * округления соседние пиксели чаще совпадают и файл сжимается примерно на треть. Глазом разница
     * не видна — проверено на пэкшотах с градиентами.
     */
    private void posterize(int[] px, int colorMask) {
        for (int i = 0; i < px.length; i++) {
            px[i] = (px[i] & 0xFF000000) | (px[i] & colorMask);
        }
    }

    /**
     * Обнуляет цвет полностью прозрачных пикселей. Их не видно, но свои (разные) значения RGB они
     * хранят и мешают сжатию: у пэкшота с вырезанным фоном это больше половины картинки, и после
     * обнуления вся эта область становится одной длинной серией одинаковых байтов.
     */
    private void clearInvisibleColors(int[] px) {
        for (int i = 0; i < px.length; i++) {
            if ((px[i] >>> 24) == 0) px[i] = 0;
        }
    }

    private boolean touchesBackground(boolean[] background, int idx, int w, int h) {
        int x = idx % w;
        int y = idx / w;
        return (x > 0 && background[idx - 1])
            || (x < w - 1 && background[idx + 1])
            || (y > 0 && background[idx - w])
            || (y < h - 1 && background[idx + w]);
    }

    /** Светлый и без выраженного цветового оттенка — таким бывает студийная подложка. */
    private boolean isBackgroundWhite(int argb) {
        int r = (argb >> 16) & 0xFF;
        int g = (argb >> 8) & 0xFF;
        int b = argb & 0xFF;
        int min = Math.min(r, Math.min(g, b));
        int max = Math.max(r, Math.max(g, b));
        return min >= BG_MIN_CHANNEL && (max - min) <= BG_MAX_SPREAD;
    }

    private int minChannel(int argb) {
        return Math.min((argb >> 16) & 0xFF, Math.min((argb >> 8) & 0xFF, argb & 0xFF));
    }
}
