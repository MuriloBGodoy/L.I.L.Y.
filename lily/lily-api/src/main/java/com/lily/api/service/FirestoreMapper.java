package com.lily.api.service;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentSnapshot;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class FirestoreMapper {

  private FirestoreMapper() {}

  static Map<String, Object> withId(DocumentSnapshot snapshot) {
    Map<String, Object> data = snapshot.getData();
    Map<String, Object> normalized = normalizeMap(data == null ? Map.of() : data);
    normalized.put("docId", snapshot.getId());
    return normalized;
  }

  static Map<String, Object> normalizeMap(Map<String, Object> source) {
    Map<String, Object> result = new LinkedHashMap<>();
    source.forEach((key, value) -> result.put(key, normalize(value)));
    return result;
  }

  static Object normalize(Object value) {
    if (value instanceof Timestamp timestamp) {
      return timestamp.toDate().toInstant().toString();
    }

    if (value instanceof Map<?, ?> map) {
      Map<String, Object> normalized = new LinkedHashMap<>();
      map.forEach((key, nestedValue) -> normalized.put(String.valueOf(key), normalize(nestedValue)));
      return normalized;
    }

    if (value instanceof List<?> list) {
      List<Object> normalized = new ArrayList<>();
      list.forEach(item -> normalized.add(normalize(item)));
      return normalized;
    }

    return value;
  }
}
