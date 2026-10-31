// Shared WebGL2 helpers for the raw-WebGL renderers (sky and glass droplets).

function compile(gl: WebGL2RenderingContext, type: number, text: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create shader');
  gl.shaderSource(shader, text);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost())
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed');
  return shader;
}

/** Compile and link a program, and look up the named uniform locations. */
export function buildProgram<Name extends string>(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
  names: readonly Name[],
): { program: WebGLProgram; uniforms: Record<Name, WebGLUniformLocation | null> } {
  const program = gl.createProgram();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- null on a lost context despite DOM typings
  if (!program) throw new Error('Could not create program');
  const vs = compile(gl, gl.VERTEX_SHADER, vertex),
    fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const uniforms = Object.fromEntries(
    names.map((name) => [name, gl.getUniformLocation(program, name)]),
  ) as Record<Name, WebGLUniformLocation | null>;
  return { program, uniforms };
}
