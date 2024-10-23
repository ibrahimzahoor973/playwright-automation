import { Schema, model } from 'mongoose';

const schema = new Schema({
  collectionId: { type: String },
  setId: { type: String },
  name: { type: String },
  numberOfPhotos: { type: Number }
}, {
  timestamps: true,
  strict: false
});

const GallerySet = model('GallerySet', schema, 'GallerySets');

export default GallerySet;
