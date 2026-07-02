package com.lily.api.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "lily")
public record ApiProperties(Cors cors, Firebase firebase) {

  public record Cors(List<String> allowedOrigins) {}

  public record Firebase(String projectId) {}
}
