package com.lily.api.security;

public record AuthenticatedUser(String uid, String email, String name) {}
