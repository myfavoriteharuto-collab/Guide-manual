import { ImageResponse } from 'next/og';

export const size        = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: '#0f172a',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: '#2563eb',
          width: 144,
          height: 144,
          borderRadius: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ color: 'white', fontSize: 88, fontWeight: 900, fontFamily: 'sans-serif' }}>
          N
        </span>
      </div>
    </div>,
    { ...size }
  );
}
