import Script from '../models/script.js';

export const UpdateScript = async ({
  filterParams,
  updateParams
}) => {
  await Script.updateOne(filterParams, updateParams);
};

export const UpsertScript = async ({
  filterParams,
  updateParams
}) => {
  await Script.updateOne(filterParams, updateParams, { upsert: true })
}
