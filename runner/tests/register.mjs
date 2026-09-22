import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(new URL('./esm-loader.mjs', import.meta.url).href, import.meta.url);
