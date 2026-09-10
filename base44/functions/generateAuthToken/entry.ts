import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Generate a cryptographically secure 32-char token using Web Crypto API
    const bytes = new Uint8Array(24); // 24 bytes → 32 base64 chars after encoding
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, 'a')
      .replace(/\//g, 'b')
      .replace(/=/g, '')
      .substring(0, 32)
      .toLowerCase();

    // Save the token on the user entity
    await base44.asServiceRole.entities.User.update(user.id, { automation_token: token });

    return Response.json({ token });
  } catch (error) {
    console.error('Token generation error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});