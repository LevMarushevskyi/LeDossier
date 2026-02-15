import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, Filter, FeTurbulence, FeColorMatrix, FeComposite, Rect, Pattern, feComponentTransfer } from 'react-native-svg';

interface BackgroundNoiseProps {
  baseColor?: string;
  opacity?: number;
}

export default function BackgroundNoise({
  baseColor = '#0C001A',
  opacity = 0.15
}: BackgroundNoiseProps) {
  // Generate unique IDs for this instance to avoid conflicts across screens
  const filterId = useMemo(() => `noiseDither-${Math.random().toString(36).substr(2, 9)}`, []);
  const patternId = useMemo(() => `bayerPattern-${Math.random().toString(36).substr(2, 9)}`, []);

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      pointerEvents="none"
    >
      <Defs>
        {/* Combined noise and dithering filter */}
        <Filter id={filterId} x="0%" y="0%" width="100%" height="100%">
          {/* Generate Perlin noise */}
          <FeTurbulence
            type="turbulence"
            baseFrequency="0.0167"
            numOctaves="3"
            seed="2"
            stitchTiles="stitch"
            result="noise"
          />

          {/* Convert noise to grayscale for dithering */}
          <FeColorMatrix
            in="noise"
            type="luminanceToAlpha"
            result="alpha"
          />

          {/* Map to cream color where bright */}
          <FeColorMatrix
            in="noise"
            type="matrix"
            values="1 0 0 0 0
                    1 0 0 0 0
                    0.933 0 0 0 0
                    0 0 0 1 0"
            result="coloredNoise"
          />
        </Filter>

        {/* Bayer 4x4 dithering pattern - 4x pixel size */}
        <Pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width="16"
          height="16"
        >
          {/* 4x4 Bayer matrix - threshold values normalized to 0-1 */}
          {/* Based on: https://godotshaders.com/shader/bayer-dithering/ */}
          <Rect x="0" y="0" width="4" height="4" fill="#FFFDEE" opacity={0/16} />
          <Rect x="4" y="0" width="4" height="4" fill="#FFFDEE" opacity={12/16} />
          <Rect x="8" y="0" width="4" height="4" fill="#FFFDEE" opacity={3/16} />
          <Rect x="12" y="0" width="4" height="4" fill="#FFFDEE" opacity={15/16} />

          <Rect x="0" y="4" width="4" height="4" fill="#FFFDEE" opacity={8/16} />
          <Rect x="4" y="4" width="4" height="4" fill="#FFFDEE" opacity={4/16} />
          <Rect x="8" y="4" width="4" height="4" fill="#FFFDEE" opacity={11/16} />
          <Rect x="12" y="4" width="4" height="4" fill="#FFFDEE" opacity={7/16} />

          <Rect x="0" y="8" width="4" height="4" fill="#FFFDEE" opacity={2/16} />
          <Rect x="4" y="8" width="4" height="4" fill="#FFFDEE" opacity={14/16} />
          <Rect x="8" y="8" width="4" height="4" fill="#FFFDEE" opacity={1/16} />
          <Rect x="12" y="8" width="4" height="4" fill="#FFFDEE" opacity={13/16} />

          <Rect x="0" y="12" width="4" height="4" fill="#FFFDEE" opacity={10/16} />
          <Rect x="4" y="12" width="4" height="4" fill="#FFFDEE" opacity={6/16} />
          <Rect x="8" y="12" width="4" height="4" fill="#FFFDEE" opacity={9/16} />
          <Rect x="12" y="12" width="4" height="4" fill="#FFFDEE" opacity={5/16} />
        </Pattern>
      </Defs>

      {/* Base layer: dark purple background */}
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={baseColor}
      />

      {/* Noise texture layer */}
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        filter={`url(#${filterId})`}
        opacity={opacity * 0.6}
      />

      {/* Bayer dithering pattern overlay with cream color */}
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={`url(#${patternId})`}
        opacity={opacity * 0.8}
      />
    </Svg>
  );
}
