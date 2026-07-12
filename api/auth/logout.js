import { clearAuthCookie } from '../../lib/auth.js';
import { route, ok } from '../../middleware/route.js';

export default route({
  async POST(req, res) {
    clearAuthCookie(res);
    ok(res, { success: true });
  },
});
