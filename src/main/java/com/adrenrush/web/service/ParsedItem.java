package com.adrenrush.web.service;

/**
 * Позиция, найденная парсером у сайта-источника, — общий язык для всех парсеров и приёмки
 * ({@link ParserStagingService}). Карточку каталога из неё делает уже администратор, подтвердив
 * позицию в админке.
 *
 * @param name        готовое название для карточки (парсер уже почистил его от оптовых пометок)
 * @param description описание из источника или null, если брать нечего
 * @param brand       бренд напитка
 * @param imageUrl    ссылка на пэкшот у источника: в окне показывается как есть, скачивается только
 *                    при принятии позиции
 * @param sourceUrl   ссылка на страницу товара — ключ, по которому позиция узнаётся между проходами
 * @param source      метка парсера, например «Monster (WorldSweet)»
 * @param volumeMl    объём банки в мл, если источник его называет, иначе null
 */
public record ParsedItem(String name, String description, String brand,
                         String imageUrl, String sourceUrl, String source, Integer volumeMl) {

    /** Позиция без объёма: большинство источников не публикует его отдельным полем. */
    public ParsedItem(String name, String description, String brand,
                      String imageUrl, String sourceUrl, String source) {
        this(name, description, brand, imageUrl, sourceUrl, source, null);
    }
}
