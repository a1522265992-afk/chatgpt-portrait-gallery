const galleryDataChangedEvent = 'portrait-gallery:data-changed';
const galleryDataChannel = 'portrait-gallery-data';

export function notifyGalleryDataChanged() {
  window.dispatchEvent(new Event(galleryDataChangedEvent));
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(galleryDataChannel);
    channel.postMessage('changed');
    channel.close();
  }
}

export function subscribeToGalleryDataChanges(onChange: () => void) {
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') onChange();
  };
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(galleryDataChannel) : null;

  window.addEventListener(galleryDataChangedEvent, onChange);
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', handleVisibility);
  if (channel) channel.onmessage = onChange;

  return () => {
    window.removeEventListener(galleryDataChangedEvent, onChange);
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', handleVisibility);
    channel?.close();
  };
}
