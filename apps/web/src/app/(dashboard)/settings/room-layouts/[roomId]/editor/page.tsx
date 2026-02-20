'use client';

import dynamic from 'next/dynamic';
import EditorLoading from './loading';

const EditorContent = dynamic(() => import('./editor-content'), {
  loading: () => <EditorLoading />,
  ssr: false,
});

export default function EditorPage() {
  return <EditorContent />;
}
