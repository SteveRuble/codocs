import { z } from "zod";

// Building blocks shared by several modules. Feature-specific schemas live next to the
// feature (modules/<feature>/<feature>.schemas.ts).

// Path parameter for /documents/:id etc. We only assert "a sane, bounded string": ids are
// opaque, and checking the cuid format would break if the id scheme ever changes. Whether
// the row exists is the service's job (404), not validation's.
export const idParams = z.object({ id: z.string().min(1).max(128) });
