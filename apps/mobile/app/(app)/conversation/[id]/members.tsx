import { useLocalSearchParams } from 'expo-router';
import { mongoIdSchema } from '@chatapp/contracts';
import { MembersScreen } from '../../../../src/messaging/members-screen';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = mongoIdSchema.safeParse(id);
  return result.success ? <MembersScreen key={result.data} id={result.data} /> : null;
}
