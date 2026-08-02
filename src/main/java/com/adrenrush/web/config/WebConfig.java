package com.adrenrush.web.config;

import org.springframework.http.CacheControl;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.concurrent.TimeUnit;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Локально сохранённые файлы (когда MinIO выключен).
        // Имена файлов уникальны (timestamp+hash), поэтому кэшируем надолго и отдаём ETag/Last-Modified.
        registry.addResourceHandler("/uploads/**")
            .addResourceLocations("file:uploads/")
            .setCacheControl(CacheControl.maxAge(30, TimeUnit.DAYS).cachePublic())
            .resourceChain(true);

        // Бандлы CRA: имя каждого файла содержит хеш содержимого (main.<hash>.js), поэтому
        // «протухнуть» они не могут — кэшируем на год как immutable. Без этого обработчика
        // на них попадал заголовок Spring Security по умолчанию (no-store), и полмегабайта
        // статики скачивалось заново при каждом заходе.
        // index.html сюда не попадает (он отдаётся обработчиком «/**») — и не должен: именно
        // он ссылается на новые хеши после выката.
        registry.addResourceHandler("/static/**")
            .addResourceLocations("classpath:/static/static/")
            .setCacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic().immutable())
            .resourceChain(true);
    }
}
