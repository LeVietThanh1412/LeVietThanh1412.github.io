const headerDecoder = new TextDecoder();

export function inspectPly(bytes, sample = false) {
  const text = headerDecoder.decode(bytes.subarray(0, 256 * 1024));
  const marker = /(?:^|\r?\n)end_header(?:\r?\n)/.exec(text);
  if (!marker) throw new Error('Header PLY không hợp lệ hoặc quá dài.');
  const header = text.slice(0, marker.index);

  const properties = new Set(
    Array.from(header.matchAll(/^property\s+\w+\s+(\w+)\s*$/gm), ([, name]) => name)
  );
  const splat = ['f_dc_0', 'scale_0', 'rot_0', 'packed_position'].some((name) => properties.has(name));
  const trained = ['f_dc_0', 'scale_0', 'rot_0'].every((name) => properties.has(name));
  const kind = splat ? 'splats' : /^element\s+face\s+[1-9]\d*/m.test(header) ? 'mesh' : 'points';
  const up = /^(?:comment|obj_info)[ \t]+(?:dynamicview_)?up_axis[ \t:=]+([+-]?[yz])(?=\s|$)/im
    .exec(header)?.[1].toLowerCase();

  // Raw Graphdeco/COLMAP splats conventionally need an X half-turn in a Y-up viewer.
  const rotations = { y: 0, '+y': 0, '-y': Math.PI, z: -Math.PI / 2, '+z': -Math.PI / 2, '-z': Math.PI / 2 };
  return { kind, rotationX: up ? rotations[up] : trained && !sample ? Math.PI : 0 };
}
