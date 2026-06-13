package com.adrenrush.web;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class AdrenRushApplication {

    public static void main(String[] args) {
        SpringApplication.run(AdrenRushApplication.class, args);
    }
}
