package com.lily.api.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Tag(name = "Health", description = "Estado basico da API.")
public class HealthController {

  @GetMapping("/health")
  @Operation(summary = "Verifica a API", description = "Confirma se o backend esta respondendo.")
  Map<String, Object> health() {
    return Map.of(
        "status", "ok",
        "service", "lily-api",
        "time", Instant.now().toString());
  }
}
