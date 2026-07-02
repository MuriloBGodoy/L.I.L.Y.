package com.lily.api.controller;

import com.lily.api.security.AuthContext;
import com.lily.api.service.LilyFirestoreService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/accounts")
public class AccountsController {

  private final LilyFirestoreService firestoreService;

  public AccountsController(LilyFirestoreService firestoreService) {
    this.firestoreService = firestoreService;
  }

  @GetMapping
  List<Map<String, Object>> accounts(HttpServletRequest request)
      throws ExecutionException, InterruptedException {
    return firestoreService.accounts(AuthContext.currentUser(request));
  }

  @PostMapping
  Map<String, Object> createAccount(
      HttpServletRequest request, @RequestBody Map<String, Object> payload)
      throws ExecutionException, InterruptedException {
    return firestoreService.createAccount(AuthContext.currentUser(request), payload);
  }

  @PutMapping("/{docId}")
  Map<String, Object> updateAccount(
      HttpServletRequest request,
      @PathVariable String docId,
      @RequestBody Map<String, Object> payload)
      throws ExecutionException, InterruptedException {
    return firestoreService.updateAccount(AuthContext.currentUser(request), docId, payload);
  }

  @DeleteMapping("/{docId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void deleteAccount(HttpServletRequest request, @PathVariable String docId)
      throws ExecutionException, InterruptedException {
    firestoreService.deleteAccount(AuthContext.currentUser(request), docId);
  }
}
