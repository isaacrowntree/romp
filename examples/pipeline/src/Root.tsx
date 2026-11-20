import { Composition } from "remotion";
import { Film } from "./Film";
import { film, FPS, W, H } from "./story";

export const Root = () => <Composition id="Synthetic" component={Film} durationInFrames={film.frames} fps={FPS} width={W} height={H} />;
