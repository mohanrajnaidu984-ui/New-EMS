import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        // Attempt to load user from local storage on initial load
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            let userData = JSON.parse(storedUser);
            // Force Admin for ranigovardhan@gmail.com
            if (userData.EmailId?.toLowerCase() === 'ranigovardhan@gmail.com' || userData.email?.toLowerCase() === 'ranigovardhan@gmail.com') {
                userData.Roles = 'Admin';
                userData.role = 'Admin';
            }
            setCurrentUser(userData);
        }
    }, []);

    const login = (userData) => {
        let finalUserData = { ...userData };
        if (finalUserData.EmailId?.toLowerCase() === 'ranigovardhan@gmail.com' || finalUserData.email?.toLowerCase() === 'ranigovardhan@gmail.com') {
            finalUserData.Roles = 'Admin';
            finalUserData.role = 'Admin';
        }
        setCurrentUser(finalUserData);
        localStorage.setItem('currentUser', JSON.stringify(finalUserData));
    };

    const logout = () => {
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
        window.location.href = '/';
    };

    const updateProfileImage = async (userId, base64) => {
        try {
            await fetch('/api/auth/update-profile-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, imageBase64: base64 })
            });
            if (currentUser) {
                const updatedUser = { ...currentUser, ProfileImage: base64 };
                setCurrentUser(updatedUser);
                localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            }
        } catch (err) {
            console.error('Failed to update profile image:', err);
        }
    };

    const authValue = React.useMemo(() => ({
        currentUser,
        login,
        logout,
        updateProfileImage,
        isAuthenticated: !!currentUser
    }), [currentUser]);

    return (
        <AuthContext.Provider value={authValue}>
            {children}
        </AuthContext.Provider>
    );
};
