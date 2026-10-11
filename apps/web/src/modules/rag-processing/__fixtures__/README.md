# Synthetic processing fixtures

Generators build real PDF object/xref trees, Unicode ToUnicode mappings, a pixel
image, password-protected Standard R2 PDF, and OOXML ZIP documents. All text is
invented for tests. None is a verified Hà Giang source or a production dataset.
No private original documents, credentials, external URLs or font downloads.
Expected text, page/section mapping and ordering are specified independently in
tests. R2/RC4 is used only to test legacy encrypted input, never for product security.
