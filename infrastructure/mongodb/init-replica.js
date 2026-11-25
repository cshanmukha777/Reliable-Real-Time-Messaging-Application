const target =
  'mongodb://mongo:27017/admin?directConnection=true&serverSelectionTimeoutMS=1000';
const setName = 'chatapp-rs';

for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const admin = new Mongo(target).getDB('admin');
    try {
      const status = admin.runCommand({ replSetGetStatus: 1 });
      if (status.set !== setName)
        throw new Error('Unexpected replica-set name.');
    } catch (error) {
      if (error.code !== 94) throw error;
      admin.runCommand({
        replSetInitiate: {
          _id: setName,
          members: [{ _id: 0, host: 'mongo:27017' }],
        },
      });
    }
    const hello = admin.runCommand({ hello: 1 });
    if (hello.isWritablePrimary && hello.setName === setName) quit(0);
  } catch (error) {
    if (attempt === 59) print(error.message);
  }
  sleep(1000);
}
throw new Error('MongoDB replica set did not elect a primary.');
