import axios from 'axios';
import fs from 'fs';
import path from 'path';

const getCookies = ({ cookies }) => {
  let cookieMerge = '';
  const cookieList = [];
  for (let i = 0; i < cookies.length; i += 1) {
    if (cookies[i].name !== 'sst-main') {
      const { name } = cookies[i];
      const { value } = cookies[i];
      cookieMerge = `${name}=${value}`;
      cookieList.push(cookieMerge);
    }
  }
  return cookieList.join(';');
};

const GetGalleries = async ({ filteredCookies, key }) => {
  try {
    const galleries = [];
    let pageNumber = 1;
    // api call to get client gallery collections
    const response = await axios({
      url: 'https://galleries.pixieset.com/api/v1/dashboard_listings?page=1',
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        cookie: filteredCookies
      },
      params: {
        page: pageNumber
      }
    });

    const { data } = response?.data || {};
    const { meta, data: galleriesData } = data || {};
    const { last_page: lastPage } = meta || {};
    const { collections } = galleriesData || {};

    galleries.push(...collections);

    // loop through all the pages
    while (lastPage !== pageNumber) {
      pageNumber += 1;
      const response = await axios({
        url: 'https://galleries.pixieset.com/api/v1/dashboard_listings?page=1',
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          cookie: filteredCookies
        },
        params: {
          page: pageNumber
        }
      });
      const { data } = response?.data || {};
      const { data: galleriesData } = data || {};
      const { collections } = galleriesData || {};

      galleries.push(...collections);
    }

    const galleryCollections = [];

    for (let i = 0; i < galleries.length; i += 1) {
      const collection = galleries[i];
      // api call to get categories of each collection if exists
      const tagResponse = await axios({
        url: `https://galleries.pixieset.com/api/v1/collections/${collection.id}/edit`,
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          cookie: filteredCookies
        }
      });

      // create data with required fields
      galleryCollections.push({
        collectionId: collection.id,
        eventDate: collection.event_date,
        galleryName: collection.name,
        numberOfPhotos: collection.photo_count,
        categories: `${tagResponse.data?.distinctTags?.join(',') || ''}`
      });
    }

    // generate csv only when the key parameter is not passed to GetGalleries method
    if (!key) {
      // header for Galleries.csv
      const header = 'Gallery Name,Number of Photos,Event Date,Event Category\n';

      // generate rows with the data
      const csvRows = galleryCollections.map(({ galleryName, numberOfPhotos, eventDate, categories }) => {
        return `${galleryName},${numberOfPhotos},${eventDate},${categories || ''}`;
      }).join('\n');

      const csvData = header + csvRows;

      const outputPath = path.join(process.cwd(), 'Galleries.csv');

      // write file
      fs.writeFile(outputPath, csvData, (err) => {
        if (err) {
          console.error('Error writing to CSV file:', err);
        } else {
          console.log('CSV file was successfully written to:', outputPath);
        }
      });
    }

    return { collections: galleryCollections };
  } catch (err) {
    console.log('Error in GetGalleries method', err);
  }
}

const GetClients = async ({ page, context }) => {
  try {
    // get cookies to authenticate requests
    const cookies = await context.cookies();

    //filter cookies
    const filteredCookies = getCookies({ cookies });

    // call this method to get the collections from client gallery
    const { collections } = await GetGalleries({ filteredCookies });

    const clientsData = [];

    for (let i = 0; i < collections.length; i += 1) {
      const collection = collections[i];
      await page.goto(`https://galleries.pixieset.com/collections/${collection.collectionId}`);
      // api to get clients data for each collection
      const response = await axios({
        url: `https://galleries.pixieset.com/api/v1/collections/${collection.collectionId}/invite_history`,
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          cookie: filteredCookies
        }
      });

      const { data } = response?.data;

      // create data with required fields
      clientsData.push(...data.map((client) => ({
        galleryName: collection.galleryName,
        clientName: client.name || '',
        clientEmail: client.email
      })));

    }

    // header for Galleries.csv
    const header = 'Gallery Name,Client Name,Client Email\n';

    // generate rows with the data
    const csvRows = clientsData.map((client) => {
      const {
        galleryName = '',
        clientName = '',
        clientEmail = ''
      } = client || {};

      return `${galleryName},${clientName},${clientEmail}`;
    }).join('\n');

    const csvData = header + csvRows;

    const outputPath = path.join(process.cwd(), 'Clients.csv');

    // write file
    fs.writeFile(outputPath, csvData, (err) => {
      if (err) {
        console.error('Error writing to CSV file:', err);
      } else {
        console.log('CSV file was successfully written to:', outputPath);
      }
    });

    // call this method to generate Photos.csv
    await GetGalleryPhotos({ page, context });
  } catch (err) {
    console.log('Error in GetClients method', err);
  }
};

const GetGalleryPhotos = async ({ page, context }) => {
  try {
    // get cookies to authenticate requests
    const cookies = await context.cookies();

    //filter cookies
    const filteredCookies = getCookies({ cookies });

    // call this method to get the collections from client gallery
    const { collections } = await GetGalleries({ filteredCookies, key: 'collections' });
    const photosData = [];

    await page.goto('https://galleries.pixieset.com/collections');
    for (let i = 0; i < collections.length; i += 1) {
      const collection = collections[i];
      // api call to get collection's sets
      const response = await axios({
        url: `https://galleries.pixieset.com/api/v1/collections/${collection.collectionId}/galleries`,
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          cookie: filteredCookies
        }
      });

      const { data: gallerySets } = response?.data;

      // loop through each set
      for (let j = 0; j < gallerySets.length; j += 1) {
        const set = gallerySets[j];
        // api call to get photos and videos in each set
        const response = await axios({
          url: `https://galleries.pixieset.com/api/v1/galleries/${set.id}?expand=photos.starred%2Cvideos`,
          method: 'GET',
          headers: {
            'content-type': 'application/json',
            cookie: filteredCookies
          }
        });

        const { data: { photos = [] } } = response?.data || {};

        // create data with required fields
        photosData.push(...photos.map((photo) => ({
          galleryName: collection.galleryName || '',
          photoId: photo.id || '',
          photoUrl: photo.path_xxlarge || '',
          xLarge: photo.path_xlarge || '',
          large: photo.path_large || '',
          medium: photo.path_medium || '',
          thumb: photo.path_thumb || '',
          displaySmall: photo.path_display_small || '',
          displayMedium: photo.path_display_medium || '',
          displayLarge: photo.path_display_large || ''
        })))
      }
    }

    // header for Photos.csv
    const header = 'Gallery Name,Photo Id,Photo Url,X Large,Large,Medium,Thumb,Display Small,Display Medium,Display Large\n';

    // generate rows with the data
    const csvRows = photosData.map((photo) => {
      const {
        galleryName,
        photoId,
        photoUrl,
        xLarge,
        large,
        medium,
        thumb,
        displaySmall,
        displayMedium,
        displayLarge,
      } = photo || {};

      return `${galleryName},${photoId},` +
        `${photoUrl ? 'https:' + photoUrl : ''},` +
        `${xLarge ? 'https:' + xLarge : ''},` +
        `${large ? 'https:' + large : ''},` +
        `${medium ? 'https:' + medium : ''},` +
        `${thumb ? 'https:' + thumb : ''},` +
        `${displaySmall ? 'https:' + displaySmall : ''},` +
        `${displayMedium ? 'https:' + displayMedium : ''},` +
        `${displayLarge ? 'https:' + displayLarge : ''}`;
    }).join('\n');


    const csvData = header + csvRows;

    const outputPath = path.join(process.cwd(), 'Photos.csv');

    // write file
    fs.writeFile(outputPath, csvData, (err) => {
      if (err) {
        console.error('Error writing to CSV file:', err);
      } else {
        console.log('CSV file was successfully written to:', outputPath);
      }
    });
  } catch (err) {
    console.log('Error in GetGalleryPhotos method', err);
  }
};

export default GetClients;