package com.lily.api.controller;

import com.lily.api.exception.ApiError;
import com.lily.api.exception.BadRequestException;
import com.lily.api.exception.NotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.concurrent.ExecutionException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

  @ExceptionHandler(BadRequestException.class)
  ResponseEntity<ApiError> badRequest(BadRequestException error, HttpServletRequest request) {
    return errorResponse(HttpStatus.BAD_REQUEST, error.getMessage(), request);
  }

  @ExceptionHandler(NotFoundException.class)
  ResponseEntity<ApiError> notFound(NotFoundException error, HttpServletRequest request) {
    return errorResponse(HttpStatus.NOT_FOUND, error.getMessage(), request);
  }

  @ExceptionHandler(ExecutionException.class)
  ResponseEntity<ApiError> firestoreError(ExecutionException error, HttpServletRequest request) {
    String message =
        error.getCause() == null
            ? "Falha ao acessar o Firestore."
            : "Falha ao acessar o Firestore: " + error.getCause().getMessage();
    return errorResponse(HttpStatus.BAD_GATEWAY, message, request);
  }

  @ExceptionHandler(InterruptedException.class)
  ResponseEntity<ApiError> interrupted(InterruptedException error, HttpServletRequest request) {
    Thread.currentThread().interrupt();
    return errorResponse(HttpStatus.SERVICE_UNAVAILABLE, "Operacao interrompida.", request);
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ApiError> internalError(Exception error, HttpServletRequest request) {
    return errorResponse(HttpStatus.INTERNAL_SERVER_ERROR, error.getMessage(), request);
  }

  private ResponseEntity<ApiError> errorResponse(
      HttpStatus status, String message, HttpServletRequest request) {
    return ResponseEntity.status(status)
        .body(ApiError.of(message, status.value(), request.getRequestURI()));
  }
}
