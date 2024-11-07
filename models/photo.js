import { Schema, model } from 'mongoose';

const schema = new Schema({
  galleryName: { type: String },
  collectionId: { type: String },
  userEmail: { type: String },
  setId: { type: String },
  photoId: { type: String },
  photoUrl: { type: String },
  xLarge: { type: String },
  large: { type: String },
  medium: { type: String },
  thumb: { type: String },
  displaySmall: { type: String },
  displayMedium: { type: String },
  displayLarge: { type: String },
  isDownloaded: { type: Boolean }
}, {
  timestamps: true,
  strict: false
});

const Photo = model('Photo', schema, 'Photos');

export default Photo;
