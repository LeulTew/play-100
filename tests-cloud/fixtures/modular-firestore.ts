import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
  QuerySnapshot,
  Transaction,
  TransactionOptions,
  WriteBatch,
} from 'firebase/firestore';

// The modular signatures of the Firestore functions these tests mock. @firebase/rules-unit-testing loads the compat
// Firestore types, and @firebase/firestore-compat augments 'firebase/firestore' with a compat overload of each of these
// (taking the compat FirebaseFirestore, DocumentReference and Query). vi.mocked types a mock by the last overload, the
// compat one, so the tests pass these to vi.mocked instead: `vi.mocked<RunTransaction>(runTransaction)`.

export type RunTransaction = <T>(
  firestore: Firestore,
  updateFunction: (transaction: Transaction) => Promise<T>,
  options?: TransactionOptions,
) => Promise<T>;

export type GetDocFromServer = <AppModelType, DbModelType extends DocumentData>(
  reference: DocumentReference<AppModelType, DbModelType>,
) => Promise<DocumentSnapshot<AppModelType, DbModelType>>;

export type GetDocsFromServer = <AppModelType, DbModelType extends DocumentData>(
  query: Query<AppModelType, DbModelType>,
) => Promise<QuerySnapshot<AppModelType, DbModelType>>;

export type CreateWriteBatch = (firestore: Firestore) => WriteBatch;
