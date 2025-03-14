import Account from '../models/account.js';

export const UpdateAccount = async ({
  filterParams,
  updateParams
}) => {
  await Account.updateOne({
    ...filterParams
  }, {
    ...updateParams
  });
};

export const GetAccount = async ({
  filterParams
}) => {
  const accountAlreadyExist = await Account.findOne({
    ...filterParams
  });
  return accountAlreadyExist;
};

export const CreateAccount = async ({
  email,
  password,
  platform
}) => {
  const account = new Account({
    email,
    password,
    platform
   });

   await account.save();
};
  