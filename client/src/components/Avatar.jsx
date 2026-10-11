// Shows the user's photo, or the first letter of their username if they have none
export default function Avatar({ user, size = 'sm' }) {
  if (user?.avatar) {
    return <img className={`avatar avatar-${size}`} src={user.avatar} alt={user.username} />;
  }
  return (
    <div className={`avatar avatar-${size} avatar-placeholder`}>
      {user?.username?.[0]?.toUpperCase() || '?'}
    </div>
  );
}
