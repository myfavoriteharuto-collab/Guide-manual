'use client';

interface Props {
  imageUrl: string;
  productName: string;
}

export default function ProductShowcase({ imageUrl, productName }: Props) {
  if (!imageUrl) return null;
  return (
    <div className="rounded-2xl overflow-hidden bg-slate-100">
      <img src={imageUrl} alt={productName} className="w-full h-auto block" />
    </div>
  );
}
