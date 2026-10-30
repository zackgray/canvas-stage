// The one 'What will be sent' line under a paid draw (the person card and the props): the exact words the next press sends,
// built by the server's own prompt code from the same inputs. Free; it only reads.
export function SentLine({ text, testId }: { text: string; testId: string }) {
  return (
    <p className="st-muted oc-sent" data-testid={testId} title="The exact words the next draw sends">
      {text.trim() ? `What will be sent: ${text}` : 'Nothing will be sent: the words are empty.'}
    </p>
  )
}
