// Arranging the store's sections through the endpoints the Settings page calls, so a test cannot
// set up an order the application itself could not produce (ADR-0005).

import assert from 'node:assert/strict';
import { readState } from './recipes.js';

/** Asks for an Aisle and hands back whatever the API answered, refusal included. */
export async function postAisle(app, name) {
  return app.inject({ method: 'POST', url: '/api/aisles', payload: { name } });
}

/** Adds an Aisle to the end of the list and returns it, failing the test if the API refused. */
export async function addAisle(app, name) {
  const response = await postAisle(app, name);
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

/** Asks for a rename and hands back whatever the API answered, refusal included. */
export async function putAisleName(app, aisleId, name) {
  return app.inject({ method: 'PUT', url: `/api/aisles/${aisleId}`, payload: { name } });
}

/** Renames an Aisle and returns it, failing the test if the API refused. */
export async function renameAisle(app, aisleId, name) {
  const response = await putAisleName(app, aisleId, name);
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}

/** Asks for a removal and hands back whatever the API answered, refusal included. */
export async function deleteAisle(app, aisleId) {
  return app.inject({ method: 'DELETE', url: `/api/aisles/${aisleId}` });
}

/** Removes an Aisle, failing the test if the API refused. */
export async function removeAisle(app, aisleId) {
  const response = await deleteAisle(app, aisleId);
  assert.equal(response.statusCode, 204, response.body);
}

/** Asks for a new walk order and hands back whatever the API answered, refusal included. */
export async function putAisleOrder(app, ids) {
  return app.inject({ method: 'PUT', url: '/api/aisles/order', payload: { ids } });
}

/** Rewrites the walk order from the full ordered list of ids, failing the test if it was refused. */
export async function reorderAisles(app, ids) {
  const response = await putAisleOrder(app, ids);
  assert.equal(response.statusCode, 204, response.body);
}

/** The Aisles the list endpoint answers with, failing the test if it refused. */
export async function listAisles(app) {
  const response = await app.inject({ method: 'GET', url: '/api/aisles' });
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}

/** The Aisles the first-paint payload carries, in the order a cook walks them. */
export async function readAisles(app) {
  return (await readState(app)).aisles;
}

/** The store's sections by the names a cook reads, in walk order. */
export async function aisleNames(app) {
  return (await readAisles(app)).map((aisle) => aisle.name);
}
