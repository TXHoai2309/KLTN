/** Add a bounded thumbnail only to canonical, versioned Cloudinary delivery URLs.
 * Legacy URLs and existing transformations retain their original identity. */
export function destinationThumbnail(url: string) {
  return url.replace(/^(https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/)(v\d+\/)/,
    "$1c_fill,w_640,h_400,q_auto,f_auto/$2");
}
