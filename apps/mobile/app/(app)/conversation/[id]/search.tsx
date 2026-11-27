import { useLocalSearchParams } from 'expo-router';
import { mongoIdSchema } from '@chatapp/contracts';
import { SearchScreen } from '../../../../src/messaging/search-screen';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = mongoIdSchema.safeParse(id);
  return result.success ? (
    <SearchScreen key={result.data} id={result.data} />
  ) : null;
}
