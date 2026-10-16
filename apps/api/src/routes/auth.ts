import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { verifyPassword, signToken, authenticateRequest } from '../auth.js';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (request, reply) => {
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid email or password format',
      });
    }

    const { email, password } = parseResult.data;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || !verifyPassword(password, user.password)) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const tokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'admin' | 'clinician' | 'viewer',
    };

    const token = signToken(tokenPayload);

    return reply.send({
      message: 'Login successful',
      token,
      user: tokenPayload,
    });
  });

  app.get('/api/auth/me', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;
    return reply.send({ user });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    return reply.send({ message: 'Logout successful' });
  });
}
