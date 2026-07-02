package com.lily.api.controller;

import com.lily.api.security.AuthContext;
import com.lily.api.service.LilyFirestoreService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

  private final LilyFirestoreService firestoreService;

  public ProfileController(LilyFirestoreService firestoreService) {
    this.firestoreService = firestoreService;
  }

  @GetMapping
  Map<String, Object> profile(HttpServletRequest request)
      throws ExecutionException, InterruptedException {
    return firestoreService.profile(AuthContext.currentUser(request));
  }

  @PutMapping
  Map<String, Object> saveProfile(
      HttpServletRequest request, @RequestBody Map<String, Object> payload)
      throws ExecutionException, InterruptedException {
    return firestoreService.saveProfile(AuthContext.currentUser(request), payload);
  }
}
