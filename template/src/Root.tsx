import { Composition } from 'remotion';
import { Timeline } from './Timeline';

// The skill sets durationInFrames/fps/size to match the footage before rendering.
export const Root: React.FC = () => (
  <Composition
    id="Main"
    component={Timeline}
    durationInFrames={1430}
    fps={60}
    width={1080}
    height={1920}
  />
);
