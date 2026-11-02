import { test } from "node:test";
import assert from "node:assert/strict";
import { verifiedPostgresConnection } from "./postgres-connection.mjs";

test("legacy TLS aliases retain certificate verification without exposing credentials", () => {
  for (const mode of ["prefer", "require", "verify-ca", "verify-full"]) {
    const input = new URL(
      "postgresql://test:p%40ss@db.example.invalid:5432/app?channel_binding=require",
    );
    input.searchParams.set("sslmode", mode);
    const output = new URL(verifiedPostgresConnection(input.toString()));
    assert.equal(output.searchParams.get("sslmode"), "verify-full");
    assert.equal(output.password, input.password);
    assert.equal(output.searchParams.get("channel_binding"), "require");
  }
});

test("explicit compatibility and local socket behavior are preserved", () => {
  for (const value of [
    "postgres://test@localhost:5432/test",
    "postgres://test@localhost/test?sslmode=disable",
    "postgresql://test@db.example.invalid/app?sslmode=require&uselibpqcompat=true",
  ])
    assert.equal(verifiedPostgresConnection(value), new URL(value).toString());
  assert.throws(
    () => verifiedPostgresConnection("https://db.example.invalid/"),
    /PostgreSQL connection/,
  );
});
