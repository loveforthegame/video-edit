// EXAMPLE Timeline — the TryApprove SaaS ad build (23.8s, 1080x1920 @ 60fps).
// Copy this file to Timeline.tsx and rewrite the sequences to match the
// narration beats of YOUR footage. Every number here came from word-level
// whisper timestamps of the actual voiceover.
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile } from 'remotion';
import { glass } from './presets';
import { NotificationStack, BrandCard, SideToggleCard, TaskAutomation, ApprovePanel, CtaPill } from './scenes';

const p = glass(); // preset chosen at the checkpoint

export const Timeline: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <OffthreadVideo src={staticFile('footage.mp4')} />

    {/* "tired of chasing clients for feedback over endless email threads" */}
    <Sequence from={18} durationInFrames={240}>
      <NotificationStack
        p={p}
        dur={240}
        items={[
          { name: 'Sarah', when: '2d ago', text: 'Any update on the logo?', x: 60, y: 130, r: -3, d: 6 },
          { name: 'Mark', when: '5d ago', text: 'Can you resend v3?', x: 250, y: 300, r: 2.4, d: 36 },
          { name: 'Alexis', when: '1w ago', text: 'Still waiting on the file…', x: 110, y: 470, r: -1.6, d: 66 },
        ]}
        counter={{ value: '12', label: 'unread' }}
      />
    </Sequence>

    {/* "simplify your workflow with TryApprove" */}
    <Sequence from={258} durationInFrames={140}>
      <BrandCard p={p} dur={140} name={<>Try<span style={{ color: p.accent }}>Approve</span></>} tagline="Client approvals on autopilot" />
    </Sequence>

    {/* "focus on your creative work while we handle the rest" */}
    <Sequence from={408} durationInFrames={212}>
      <SideToggleCard p={p} dur={212} label="Focus mode" pill="We handle the rest" />
    </Sequence>

    {/* "every time you add a task for review, we automatically email your clients" */}
    <Sequence from={630} durationInFrames={414}>
      <TaskAutomation
        p={p}
        dur={414}
        kicker="NEW TASK"
        title="Homepage design"
        tag="FOR REVIEW"
        toastTitle="Client notified"
        toastSub="automatically, by email"
        typingLabel="Sarah is viewing"
      />
    </Sequence>

    {/* "approve designs instantly, without login barriers" */}
    <Sequence from={1056} durationInFrames={210}>
      <ApprovePanel
        p={p}
        dur={210}
        title="Homepage design"
        sub="v3 • awaiting approval"
        buttonIdle="APPROVE"
        buttonDone="APPROVED"
        pill="🔓 No login required"
      />
    </Sequence>

    {/* "try it free today" — overlaid while the speaker keeps talking, never a dead outro */}
    <Sequence from={1272} durationInFrames={158}>
      <CtaPill p={p} dur={158} label="Try it free today →" />
    </Sequence>

    {/* SFX — resolved into public/sfx/ by the skill at build time; delete any line whose file is missing */}
    <Sequence from={24}><Audio src={staticFile('sfx/pop.mp3')} volume={0.3} /></Sequence>
    <Sequence from={54}><Audio src={staticFile('sfx/pop.mp3')} volume={0.3} /></Sequence>
    <Sequence from={84}><Audio src={staticFile('sfx/pop.mp3')} volume={0.3} /></Sequence>
    <Sequence from={258}><Audio src={staticFile('sfx/sweep-fast-small.mp3')} volume={0.4} /></Sequence>
    <Sequence from={680}><Audio src={staticFile('sfx/transition-snap.mp3')} volume={0.35} /></Sequence>
    <Sequence from={784}><Audio src={staticFile('sfx/whoosh-fast.mp3')} volume={0.4} /></Sequence>
    <Sequence from={880}><Audio src={staticFile('sfx/pop.mp3')} volume={0.3} /></Sequence>
    <Sequence from={1116}><Audio src={staticFile('sfx/transition-snap.mp3')} volume={0.4} /></Sequence>
    <Sequence from={1130}><Audio src={staticFile('sfx/shimmer-sparkle-sweep.mp3')} volume={0.28} /></Sequence>
    <Sequence from={1272}><Audio src={staticFile('sfx/bass-hit-short.mp3')} volume={0.4} /></Sequence>
  </AbsoluteFill>
);
