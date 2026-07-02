# L.I.L.Y API

Backend Java/Spring Boot para a L.I.L.Y.

## Requisitos

- Java 21
- Maven 3.9+ ou a copia local em `tools/apache-maven-3.9.16`
- Credencial Firebase Admin com acesso ao Firestore

## Rodando localmente

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\caminho\para\service-account.json"
$env:FIREBASE_PROJECT_ID="lilyxz2606"
$env:LILY_CORS_ALLOWED_ORIGINS="http://localhost:1420,http://127.0.0.1:1420"
..\..\tools\apache-maven-3.9.16\bin\mvn.cmd spring-boot:run
```

A API sobe em `http://localhost:8080`.

Swagger UI:

```txt
http://localhost:8080/swagger-ui/index.html
```

## Endpoints

- `GET /api/health`
- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/accounts`
- `POST /api/accounts`
- `PUT /api/accounts/{docId}`
- `DELETE /api/accounts/{docId}`
- `GET /api/config`
- `PUT /api/config`

Todos os endpoints, exceto `/api/health` e Swagger, esperam `Authorization: Bearer <firebase-id-token>`.

## Exemplos de payload

Perfil:

```json
{
  "nome": "Santa Rita Radiadores",
  "user": "santarita",
  "email": "contato@santarita.com",
  "phone": "(11) 99999-9999",
  "doc": "00.000.000/0001-00",
  "type": "PJ",
  "photoURL": ""
}
```

Conta:

```json
{
  "id": 1783020000000,
  "marca": "Volkswagen",
  "veiculo": "Gol",
  "tipo_peca": "Radiador",
  "cliente_nome": "Cliente avulso",
  "data": "2026-07-02T19:40:00.000Z",
  "modo": false,
  "vinicial": "100",
  "frete": "20",
  "func": "30",
  "material": "40",
  "horas": "2",
  "inss": "10",
  "vendido_por": "350",
  "mao_de_obra": "80",
  "total": 350
}
```

Configuracao:

```json
{
  "valorHora": 40,
  "pecas": ["Radiador", "Caixa", "Intercooler", "Condensador"],
  "clientes": []
}
```

Na raiz do repositorio tambem da para usar:

```powershell
npm run api:dev
npm run api:build
```
