package com.adrenrush.web.controller;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Отдаёт index.html React-приложения для всех клиентских маршрутов. */
@RestController
public class SpaController {

    private static final Resource INDEX_HTML = new ClassPathResource("static/index.html");

    @GetMapping(
        value = {"/", "/login", "/register", "/profile", "/profile/**",
                 "/drink/**", "/user/**", "/admin", "/admin/**",
                 "/chats", "/chats/**"},
        produces = MediaType.TEXT_HTML_VALUE
    )
    public ResponseEntity<Resource> index() {
        return ResponseEntity.ok()
            .contentType(MediaType.TEXT_HTML)
            .body(INDEX_HTML);
    }
}
