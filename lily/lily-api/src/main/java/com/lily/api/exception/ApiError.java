package com.lily.api.exception;

import java.time.Instant;

public record ApiError(String error, int status, String path, String time) {

  public static ApiError of(String error, int status, String path) {
    return new ApiError(error, status, path, Instant.now().toString());
  }
}
