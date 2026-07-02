package com.lily.api.service;

import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.Query.Direction;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.SetOptions;
import com.lily.api.exception.BadRequestException;
import com.lily.api.exception.NotFoundException;
import com.lily.api.security.AuthenticatedUser;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import org.springframework.stereotype.Service;

@Service
public class LilyFirestoreService {

  private final Firestore firestore;

  public LilyFirestoreService(Firestore firestore) {
    this.firestore = firestore;
  }

  public Map<String, Object> profile(AuthenticatedUser user)
      throws ExecutionException, InterruptedException {
    Map<String, Object> data =
        firestore.collection("users").document(user.uid()).get().get().getData();
    return FirestoreMapper.normalizeMap(data == null ? Map.of() : data);
  }

  public Map<String, Object> saveProfile(AuthenticatedUser user, Map<String, Object> payload)
      throws ExecutionException, InterruptedException {
    requireText(payload, "nome", "Nome e obrigatorio.");
    requireText(payload, "user", "Usuario e obrigatorio.");

    Map<String, Object> data = clean(payload);
    data.put("email", firstText(data.get("email"), user.email()));
    data.put("updatedAt", FieldValue.serverTimestamp());
    firestore.collection("users").document(user.uid()).set(data, SetOptions.merge()).get();
    return profile(user);
  }

  public List<Map<String, Object>> accounts(AuthenticatedUser user)
      throws ExecutionException, InterruptedException {
    List<QueryDocumentSnapshot> docs =
        firestore
            .collection("accounts")
            .whereEqualTo("user_id", user.uid())
            .orderBy("data", Direction.DESCENDING)
            .get()
            .get()
            .getDocuments();

    return docs.stream().map(FirestoreMapper::withId).toList();
  }

  public Map<String, Object> createAccount(AuthenticatedUser user, Map<String, Object> payload)
      throws ExecutionException, InterruptedException {
    Map<String, Object> data = accountPayload(user, payload);
    data.put("createdAt", FieldValue.serverTimestamp());
    DocumentReference created = firestore.collection("accounts").add(data).get();
    return FirestoreMapper.withId(created.get().get());
  }

  public Map<String, Object> updateAccount(
      AuthenticatedUser user, String docId, Map<String, Object> payload)
      throws ExecutionException, InterruptedException {
    DocumentReference accountRef = firestore.collection("accounts").document(docId);
    Map<String, Object> existing = accountRef.get().get().getData();
    if (existing == null || !user.uid().equals(existing.get("user_id"))) {
      throw new NotFoundException("Conta nao encontrada para este usuario.");
    }

    accountRef.set(accountPayload(user, payload), SetOptions.merge()).get();
    return FirestoreMapper.withId(accountRef.get().get());
  }

  public void deleteAccount(AuthenticatedUser user, String docId)
      throws ExecutionException, InterruptedException {
    DocumentReference accountRef = firestore.collection("accounts").document(docId);
    Map<String, Object> existing = accountRef.get().get().getData();
    if (existing == null || !user.uid().equals(existing.get("user_id"))) {
      throw new NotFoundException("Conta nao encontrada para este usuario.");
    }

    accountRef.delete().get();
  }

  public Map<String, Object> config(AuthenticatedUser user)
      throws ExecutionException, InterruptedException {
    Map<String, Object> data =
        firestore
            .collection("users")
            .document(user.uid())
            .collection("private")
            .document("config")
            .get()
            .get()
            .getData();
    return FirestoreMapper.normalizeMap(data == null ? Map.of() : data);
  }

  public Map<String, Object> saveConfig(AuthenticatedUser user, Map<String, Object> payload)
      throws ExecutionException, InterruptedException {
    Map<String, Object> data = clean(payload);
    if (!data.containsKey("valorHora")) {
      data.put("valorHora", 40);
    }
    data.put("updatedAt", FieldValue.serverTimestamp());
    firestore
        .collection("users")
        .document(user.uid())
        .collection("private")
        .document("config")
        .set(data, SetOptions.merge())
        .get();
    return config(user);
  }

  private Map<String, Object> accountPayload(AuthenticatedUser user, Map<String, Object> payload) {
    requireText(payload, "marca", "Marca e obrigatoria.");
    requireText(payload, "veiculo", "Veiculo e obrigatorio.");
    requireText(payload, "tipo_peca", "Tipo de peca e obrigatorio.");

    Map<String, Object> data = clean(payload);
    data.put("user_id", user.uid());
    data.put("updatedAt", FieldValue.serverTimestamp());
    return data;
  }

  private Map<String, Object> clean(Map<String, Object> payload) {
    Map<String, Object> data = new LinkedHashMap<>();
    if (payload != null) {
      payload.forEach(
          (key, value) -> {
            if (value != null && !"docId".equals(key)) {
              data.put(key, value);
            }
          });
    }
    return data;
  }

  private void requireText(Map<String, Object> payload, String key, String message) {
    if (payload == null || !hasText(payload.get(key))) {
      throw new BadRequestException(message);
    }
  }

  private boolean hasText(Object value) {
    return value instanceof String text && !text.isBlank();
  }

  private String firstText(Object preferred, String fallback) {
    if (preferred instanceof String text && !text.isBlank()) {
      return text;
    }
    return fallback == null ? "" : fallback;
  }
}
