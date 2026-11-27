import { useLocalSearchParams } from 'expo-router';
import { mongoIdSchema } from '@chatapp/contracts';
import { ConnectedThread } from '../../../../src/messaging/thread-screen';

export default function ThreadRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = mongoIdSchema.safeParse(id);
  return result.success ? (
    <ConnectedThread key={result.data} id={result.data} />
  ) : null;
}
