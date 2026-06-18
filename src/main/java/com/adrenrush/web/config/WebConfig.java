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
    }
}
