package com.lily.api;

import com.lily.api.config.ApiProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(ApiProperties.class)
public class LilyApiApplication {

  public static void main(String[] args) {
    SpringApplication.run(LilyApiApplication.class, args);
  }
}
