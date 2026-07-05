import "server-only";
import { prisma } from "./db";

export interface SubscribeState {
  count: number;
  subscribed: boolean;
}

/** Subscriber count for a channel, plus whether `viewerId` is one of them. */
export async function getSubscribeState(
  channelId: string,
  viewerId: string | null,
): Promise<SubscribeState> {
  const [count, mine] = await Promise.all([
    prisma.subscription.count({ where: { channelId } }),
    viewerId && viewerId !== channelId
      ? prisma.subscription.findUnique({
          where: { subscriberId_channelId: { subscriberId: viewerId, channelId } },
          select: { channelId: true },
        })
      : Promise.resolve(null),
  ]);
  return { count, subscribed: mine != null };
}

/** Toggle a subscription. No-op (and never subscribes) for self-channels. */
export async function toggleSubscription(
  subscriberId: string,
  channelId: string,
): Promise<SubscribeState> {
  if (subscriberId === channelId) return getSubscribeState(channelId, subscriberId);

  const existing = await prisma.subscription.findUnique({
    where: { subscriberId_channelId: { subscriberId, channelId } },
    select: { channelId: true },
  });
  if (existing) {
    await prisma.subscription.delete({
      where: { subscriberId_channelId: { subscriberId, channelId } },
    });
  } else {
    await prisma.subscription.create({ data: { subscriberId, channelId } });
  }
  return getSubscribeState(channelId, subscriberId);
}
