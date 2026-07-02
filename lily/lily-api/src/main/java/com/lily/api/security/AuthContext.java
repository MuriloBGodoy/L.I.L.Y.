package com.lily.api.security;

import jakarta.servlet.http.HttpServletRequest;

public final class AuthContext {

  public static final String REQUEST_ATTRIBUTE = "authenticatedUser";

  private AuthContext() {}

  public static AuthenticatedUser currentUser(HttpServletRequest request) {
    Object user = request.getAttribute(REQUEST_ATTRIBUTE);
    if (user instanceof AuthenticatedUser authenticatedUser) {
      return authenticatedUser;
    }
    throw new IllegalStateException("Usuario autenticado nao encontrado.");
  }
}
