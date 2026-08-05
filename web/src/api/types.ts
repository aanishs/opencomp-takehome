// Domain types re-exported from the generated OpenAPI schema so app code
// never hand-writes an API shape. Regenerate with `npm run gen:api` after
// editing openapi/openapi.yaml.
import type { components } from "../../../openapi/generated/schema";

export type User = components["schemas"]["User"];
export type Book = components["schemas"]["Book"];
export type CheckoutBook = components["schemas"]["CheckoutBook"];
export type Checkout = components["schemas"]["Checkout"];
export type Pagination = components["schemas"]["Pagination"];
export type LibrarianMessage = components["schemas"]["LibrarianMessage"];
